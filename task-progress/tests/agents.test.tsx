import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'task-progress',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('each agent gets its own bar', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('agent.list', () => ({
    value: [{ id: 'a1', description: 'Research docs', type: 'Explore' }] as never,
  }))

  // Claude's own list: 1 of 3 done.
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Plan', status: 'completed', activeForm: 'Planning' },
      { content: 'Build', status: 'in_progress', activeForm: 'Building' },
      { content: 'Ship', status: 'pending', activeForm: 'Shipping' },
    ],
  })
  // A subagent's list: 0 of 2 done.
  await $.tool.call({
    tool: 'TodoWrite',
    agentId: 'a1',
    todos: [
      { content: 'Search', status: 'in_progress', activeForm: 'Searching' },
      { content: 'Summarise', status: 'pending', activeForm: 'Summarising' },
    ],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^Claude$/ }))?.text).toBe('Claude')
    expect((await ui.find({ type: 'Text', text: /Research docs/ }))?.text).toBe('Research docs')
    expect((await ui.find({ type: 'Text', text: /1 of 3/ }))?.text).toBe('1 of 3')
    expect((await ui.find({ type: 'Text', text: /0 of 2/ }))?.text).toBe('0 of 2')
    expect((await ui.find({ type: 'Text', text: /Now: Search/ }))?.text).toBe('Now: Search')
    await ui.unmount()
  }
})

test('a finished agent drops its bar', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  // Stands for the engine's own drawing when the mod passes.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Plan', status: 'completed', activeForm: 'Planning' }],
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Claude/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('a subagent with no task list shows its activity until it ends', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a2' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.agent.spawn({ prompt: 'look around', description: 'Scan the repo', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a2' })
  await $.tool.call({ tool: 'Bash', command: 'pwd', agentId: 'a2' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Scan the repo/ }))?.text).toBe('Scan the repo')
    expect((await ui.find({ type: 'Text', text: /tool calls/ }))?.text).toBe('2 tool calls')
    await ui.unmount()
  }

  await $.turn.complete({ agentId: 'a2', reason: 'end_turn', text: '', turnId: 't1' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Scan the repo/ })).toBeUndefined()
  await ui.unmount()
})

test('All steps expands the full list and Hide steps folds it', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Plan', status: 'completed', activeForm: 'Planning' },
      { content: 'Build', status: 'in_progress', activeForm: 'Building' },
      { content: 'Ship', status: 'pending', activeForm: 'Shipping' },
    ],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /○ Ship/ })).toBeUndefined()
    await ui.press({ key: 'toggle-main' })
    expect((await ui.find({ type: 'Text', text: /✓ Plan/ }))?.text).toBe('✓ Plan')
    expect((await ui.find({ type: 'Text', text: /● Build/ }))?.text).toBe('● Build')
    expect((await ui.find({ type: 'Text', text: /○ Ship/ }))?.text).toBe('○ Ship')
    await ui.press({ key: 'toggle-main' })
    expect(await ui.find({ type: 'Text', text: /○ Ship/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('to-do tool rows are hidden, other tool rows are kept', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  const row = (tool: string) => ({
    plugin: 'task-progress',
    component: 'ToolUse',
    surface: 'desktop',
    props: { tool_use_id: 't1', tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  }) as const

  const todo = await $.ui.mount(row('TodoWrite') as never)
  expect(await todo.find({ type: 'Text', text: /engine row/ })).toBeUndefined()
  await todo.unmount()

  const bash = await $.ui.mount(row('Bash') as never)
  expect((await bash.find({ type: 'Text', text: /engine row/ }))?.text).toBe('engine row')
  await bash.unmount()
})

test('desktop draws a thin rounded SVG bar; terminal a full-width line', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'A', status: 'completed', activeForm: 'A' },
      { content: 'B', status: 'in_progress', activeForm: 'B' },
    ],
  })
  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await desk.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  const source = String((svg?.props as { source?: string } | undefined)?.source)
  expect(source).toContain('width="8000" height="6"')
  expect(source).toContain('preserveAspectRatio="none"')
  // Half done: the fill ends halfway along the inset track (4 + 0.5 * 992).
  expect(source).toContain('x2="500"')
  await desk.unmount()

  // 60 columns less border and padding: 54 cells, half of them filled.
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const lines = (await term.findAll({ type: 'Text', text: /^━+$/ })).map(t => t.text?.length)
  expect(lines).toEqual([27, 27])
  await term.unmount()
})
