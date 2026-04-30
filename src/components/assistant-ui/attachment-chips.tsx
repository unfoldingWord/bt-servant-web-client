import { FileText } from "lucide-react";
import type { FC } from "react";
import type { Attachment } from "@/types/engine";
import { formatBytes } from "@/lib/utils";

interface AttachmentChipsProps {
  attachments: Attachment[];
}

export const AttachmentChips: FC<AttachmentChipsProps> = ({ attachments }) => {
  if (!attachments.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((a) => {
        if (a.type !== "pdf") return null;
        return (
          <a
            key={a.url}
            href={a.url}
            download={a.filename}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-[#d8d6d0] bg-white px-3 py-1.5 font-sans text-[0.8rem] text-[#1a1a18] transition-colors hover:bg-[#f5f3ee] dark:border-[#3a3937] dark:bg-[#1a1a18] dark:text-[#eee] dark:hover:bg-[#2a2927]"
          >
            <FileText size={14} className="shrink-0" />
            <span className="max-w-[18rem] truncate">{a.filename}</span>
            <span className="text-[#8a8985] dark:text-[#9a9893]">
              · {formatBytes(a.size_bytes)}
            </span>
          </a>
        );
      })}
    </div>
  );
};
