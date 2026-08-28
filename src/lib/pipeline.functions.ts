import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const transcribeChunkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        audioBase64: z.string().min(100),
        offset: z.number().min(0),
        duration: z.number().min(0.5).max(600),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { transcribeChunk } = await import("./pipeline.server");
    return { segments: await transcribeChunk(data) };
  });

export const detectClipsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        targetCount: z.number().int().min(1).max(20).default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { detectClips, wordsInRange } = await import("./pipeline.server");
    const { buildSrt } = await import("./srt");

    const { data: project, error } = await context.supabase
      .from("projects")
      .select("id, transcript, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!project?.transcript) throw new Error("Transkrip belum tersedia untuk proyek ini.");

    const transcript = project.transcript as unknown as import("./pipeline-types").Transcript;
    const detected = await detectClips(transcript, data.targetCount);
    if (detected.length === 0) throw new Error("AI tidak menemukan klip yang layak dari transkrip ini.");

    await context.supabase.from("clips").delete().eq("project_id", data.projectId);

    const rows = detected.map((clip) => {
      const words = wordsInRange(transcript, clip.start, clip.end);
      return {
        project_id: data.projectId,
        user_id: context.userId,
        title: clip.title,
        description: clip.description,
        hashtags: clip.hashtags,
        start_time: clip.start,
        end_time: clip.end,
        virality_score: clip.score,
        hook_type: clip.hook,
        caption_words: words as unknown as import("@/integrations/supabase/types").Json,
        srt_content: buildSrt(words),
        status: "ready",
      };
    });

    const { error: insertError } = await context.supabase.from("clips").insert(rows);
    if (insertError) throw new Error(insertError.message);

    return { count: rows.length };
  });
