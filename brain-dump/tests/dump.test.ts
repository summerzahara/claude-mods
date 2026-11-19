import { expect, test } from 'claude-code/testing'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

test('/dump cleans the text and puts it in the prompt box', async ($, on) => {
  let asked = ''
  let filled = ''
  on('command.register', () => ({ value: { command: 'dump' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', (_, e) => {
    asked = e.prompt
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return { value: { isAnswered: true as const, text: '## Goal\nPlan my week.', usage } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('prompt.fill', (_, e) => {
    filled = e.text
    return { isFilled: true }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'dump', args: 'um so like I wanna plan my week', ...RUN })

  expect(asked).toContain('plan my week')
  expect(filled).toBe('## Goal\nPlan my week.')
  expect(r.text).toContain('prompt box')
})

test('bare /dump explains how to use it', async ($, on) => {
  on('command.register', () => ({ value: { command: 'dump' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'dump', args: '', ...RUN })
  expect(r.text).toContain('Usage')
})
