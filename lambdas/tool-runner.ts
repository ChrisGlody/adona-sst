import { S3 } from "aws-sdk";
import Ajv from "ajv";
import { createContext, runInNewContext } from "vm";

const s3 = new S3();
const ajv = new Ajv({ strict: false });

export const main = async (event: any) => {
  // event: { toolId, input }
  const { toolId, input } = event;
  // load tool metadata from Postgres or S3. For simplicity assume S3 JSON at key `tools/{toolId}.json`
  const bucket = process.env.TOOLS_BUCKET!;
  const key = `tools/${toolId}.json`;

  const metaResp = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const meta = JSON.parse(metaResp.Body!.toString());

  // validate input
  const validate = ajv.compile(meta.inputSchema);
  if (!validate(input)) {
    return { error: "Invalid input", details: validate.errors };
  }

  // load implementation (meta.implementation contains either code or an s3 key)
  const implKey = meta.implementation; // e.g. 'code/{toolId}.js'
  const implResp = await s3.getObject({ Bucket: bucket, Key: implKey }).promise();
  const code = implResp.Body!.toString();

  try {
    // Create a sandboxed context with limited access
    const sandbox = {
      console: {
        log: (...args: any[]) => console.log(...args),
        error: (...args: any[]) => console.error(...args),
      },
      setTimeout: (fn: Function, delay: number) => setTimeout(fn, delay),
      setInterval: (fn: Function, delay: number) => setInterval(fn, delay),
      clearTimeout: (id: any) => clearTimeout(id),
      clearInterval: (id: any) => clearInterval(id),
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      TypeError,
      ReferenceError,
      SyntaxError,
    };

    // Create a context with the sandbox
    const context = createContext(sandbox);

    // Expect code exports a function named `main`
    // Convert ES6 module syntax to CommonJS format
    const script = `
      const exports = {};
      const module = { exports };
      
      // Replace export with module.exports
      ${code.replace(/export\s+async\s+function\s+main/g, 'async function main')}
      
      // If the code exports a main function, make it available
      if (typeof main === 'function') {
        module.exports.main = main;
      }
      
      module.exports;
    `;
    
    const exported = runInNewContext(script, context, {
      timeout: 2000, // 2 second timeout
      displayErrors: true,
    });

    // Debug: log what functions are available
    console.log("Available functions:", Object.keys(exported));
    console.log("Code that was executed:", code);

    if (typeof exported.main !== "function") {
      return { error: "Tool implementation must export async function main(input)" };
    }

    // run tool
    const result = await exported.main(input);
    // optionally validate output with meta.output_schema
    return { result };
  } catch (error) {
    return { 
      error: "Execution error", 
      details: error instanceof Error ? error.message : String(error) 
    };
  }
};
