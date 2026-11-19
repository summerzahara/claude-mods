---
description: Clean up a voice-to-text brain dump into a structured prompt
argument-hint: [your brain dump]
---

The text below is my brain dump. I spoke it aloud and voice-to-text transcribed it, so it has filler words, false starts, repeats, self-corrections ("no wait, actually...") and transcription mistakes.

Rewrite it as ONE clean prompt, in my first person, addressed to you (Claude):

- Keep every real idea, requirement, constraint, preference and question. Drop only filler and repetition.
- When I corrected myself, keep only my final version.
- Fix obvious transcription errors; if a word is truly unclear, keep it and mark it [unclear?].
- Do not invent requirements, details or decisions I did not express.
- Use these sections, leaving out any that would be empty: **Goal**, **Context**, **Requirements**, **Open questions**, **Output**.

Show me the cleaned prompt in a code block so I can copy it. Then ask whether I want you to go ahead and act on it, or change something first. Do not start the work until I say so.

<brain_dump>
$ARGUMENTS
</brain_dump>
