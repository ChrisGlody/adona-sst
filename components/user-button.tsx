"use client";

import { getCurrentUser, signOut } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";

export default function UserButton() {
    const [username, setUsername] = useState<string | null>(null);
    const router = useRouter();
    useEffect(() => {
        (async () => {
            const user = await getCurrentUser();
            setUsername(user.signInDetails?.loginId ?? "");
        })();
    }, []);

    const handleLogout = async () => {
        await signOut();
        router.replace("/");
    };

    return (
        <div>
            <p>{username}</p>
            <Button onClick={handleLogout}>Logout</Button>
        </div>
    );
}