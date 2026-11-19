import type { Register } from 'claude-code'

const SYSTEM = `You turn messy voice-to-text brain dumps into clear prompts for Claude.

The input was spoken aloud and transcribed. Expect filler words (um, like, you know),
false starts, repeated ideas, self-corrections ("no wait, actually..."), run-on
sentences and transcription mistakes (wrong homophones, garbled names).

Rewrite it as ONE clean prompt written in the speaker's first person, addressed to Claude.

Rules:
- Keep every real idea, requirement, constraint, preference and question. Drop only filler and repetition.
- When the speaker corrects themselves, keep only the final version.
- Fix obvious transcription errors; if a word is truly unclear, keep it and mark it [unclear?].
- Do not invent requirements, details or decisions the speaker did not express.
- Group related thoughts. Use this structure, leaving out any section that would be empty:

## Goal
One or two sentences: what I want Claude to do.

## Context
Background Claude needs.

## Requirements
- Bulleted specifics, constraints and preferences.

## Open questions
- Things I was unsure about or asked about.

## Output
What I want back (format, length, tone), if I said.

Reply with the rewritten prompt only: no preamble, no commentary, no code fences.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'dump',
      description: 'Clean up a voice-to-text brain dump into a structured prompt',
      argumentHint: '[your brain dump]',
    })

    return next(e)
  })

  on('command.run', { command: 'dump' }, async ($, e) => {
    const raw = e.args.trim()

    if (raw === '') {
      return {
        text: 'Usage: /dump <your brain dump>. Dictate or paste everything after /dump, then press Enter. The cleaned prompt lands in your prompt box to review before you send it.',
      }
    }

    $.ui.status('Cleaning up your brain dump...')
    const reply = await $.model.complete({
      model: 'sonnet',
      system: SYSTEM,
      prompt: `<brain_dump>\n${raw}\n</brain_dump>`,
      maxTokens: 4000,
      timeoutMs: 90000,
    })
    $.ui.status(undefined)

    if (!reply.isAnswered) {
      return {
        text: `Could not clean that up (${reply.reason}). Your original text is unchanged; try /dump again.`,
      }
    }

    const cleaned = reply.text.trim()
    const filled = await $.prompt.fill({ text: cleaned })

    if (filled.isFilled) {
      return {
        text: 'Cleaned prompt is in your prompt box. Edit anything you like, then press Enter to send it.',
      }
    }

    return { text: `Cleaned prompt (copy it and send it):\n\n${cleaned}` }
  })
}
