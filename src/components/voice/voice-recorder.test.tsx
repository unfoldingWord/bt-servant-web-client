import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/i18n";
import { LOCALES, SUPPORTED_LOCALES } from "@/test/copy";
import { stubNavigatorLanguage } from "@/test/navigator";
import { VoiceRecorder } from "./voice-recorder";

// jsdom has no MediaRecorder, so the recorder hook is replaced by a double
// that reports an active recording. Only the component's copy and controls
// are under test here.
const stopRecording = vi.fn();
const cancelRecording = vi.fn();
vi.mock("@/hooks/use-voice-recorder", () => ({
  useVoiceRecorder: () => ({
    isRecording: true,
    isSupported: true,
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording,
    cancelRecording,
    recordingDuration: 3,
  }),
}));

describe.each(SUPPORTED_LOCALES)("VoiceRecorder [%s]", (locale) => {
  const dict = LOCALES[locale].dictionary;

  it("labels its icon-only cancel and stop controls from the dictionary and wires them", async () => {
    stubNavigatorLanguage(locale);
    stopRecording.mockResolvedValue({ audioBase64: "QUJD", format: "webm" });
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(
      <LocaleProvider>
        <VoiceRecorder onComplete={onComplete} onCancel={onCancel} />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    expect(screen.getByText(dict["recorder.recording"])).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: dict["recorder.stop"] })
    );
    expect(onComplete).toHaveBeenCalledWith("QUJD", "webm");

    await user.click(
      screen.getByRole("button", { name: dict["recorder.cancel"] })
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
