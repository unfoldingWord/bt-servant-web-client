import { AssistantProvider } from "@/components/providers/assistant-provider";
import { ClientThread } from "@/components/assistant-ui/client-thread";
import { auth, signOut } from "@/auth";
import { UserMenu } from "@/components/user-menu";

export default async function ChatPage() {
  const session = await auth();

  const handleSignOut = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <AssistantProvider>
      <div className="flex h-screen flex-col bg-gradient-to-b from-[#F5F5F0] from-70% to-[#E5E5DD] dark:from-[#2b2a27] dark:from-70% dark:to-[#201f1d]">
        <header className="flex items-center justify-end bg-transparent px-4 py-3">
          <UserMenu
            userInitial={session?.user?.name?.[0]?.toUpperCase() || "U"}
            onSignOut={handleSignOut}
          />
        </header>
        <main className="flex-1 overflow-hidden">
          <ClientThread />
        </main>
      </div>
    </AssistantProvider>
  );
}
