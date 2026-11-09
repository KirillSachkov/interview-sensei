import { useMutation } from "@tanstack/react-query";

import { answerQuestion } from "@/shared/api";

/** «Не знаю»: an honest skip; the Attempt gets Grade 0 and the mark «пропущено». */
export function SkipButton({ interviewId }: { interviewId: string }) {
  const skip = useMutation({
    mutationFn: async () => answerQuestion(interviewId, { skipped: true }),
  });
  return (
    <>
      <button
        type="button"
        className="ghost"
        disabled={skip.isPending}
        onClick={() => {
          skip.mutate();
        }}
      >
        Не знаю
      </button>
      {skip.isError ? <p role="alert">Не отправлено: {skip.error.message}</p> : null}
    </>
  );
}
