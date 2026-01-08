import { AssistantProvider } from "@/components/providers/assistant-provider";
import { ClientThread } from "@/components/assistant-ui/client-thread";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default async function ChatPage() {
  const session = await auth();

  return (
    <AssistantProvider>
      <div className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-lg font-semibold">BT Servant</h1>
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={session?.user?.image || undefined} />
              <AvatarFallback>
                {session?.user?.name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 overflow-hidden">
          <ClientThread />
        </main>
      </div>
    </AssistantProvider>
  );
}
