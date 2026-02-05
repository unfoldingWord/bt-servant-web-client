import { AssistantProvider } from "@/components/providers/assistant-provider";
import { ClientThread } from "@/components/assistant-ui/client-thread";
import { auth } from "@/auth";
import { UserMenu } from "@/components/user-menu";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookBible } from "@fortawesome/pro-duotone-svg-icons";

export default async function ChatPage() {
  const session = await auth();

  return (
    <AssistantProvider>
      <div className="flex h-dvh flex-col overscroll-none bg-gradient-to-b from-[#F5F5F0] from-70% to-[#E5E5DD] dark:from-[#2b2a27] dark:from-70% dark:to-[#201f1d]">
        <header className="flex items-center justify-between bg-transparent px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex items-center justify-center"
              style={
                {
                  fontSize: "1.75rem",
                  lineHeight: 1,
                  "--fa-primary-color": "#ffffff",
                  "--fa-primary-opacity": "1",
                  "--fa-secondary-color": "#ae5630",
                  "--fa-secondary-opacity": "1",
                } as React.CSSProperties
              }
            >
              <FontAwesomeIcon icon={faBookBible} />
            </span>
            <span className="font-sans text-sm font-medium text-[#6b6a68] dark:text-[#9a9893]">
              BTS Web
            </span>
          </div>
          <UserMenu
            userInitial={session?.user?.name?.[0]?.toUpperCase() || "U"}
          />
        </header>
        <main className="flex-1 overflow-hidden">
          <ClientThread />
        </main>
      </div>
    </AssistantProvider>
  );
}
