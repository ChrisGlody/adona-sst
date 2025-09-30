
export async function main(event: any) {
    console.log("ToolRunner invoked", event);
  
    // Example: event = { toolId, input }
    // TODO: load tool metadata + code from S3 and run securely
    return {
      ok: true,
      echo: event,
    };
}