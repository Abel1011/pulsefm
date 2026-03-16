import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import type { ScheduleStore } from '../lib/schedule-store.js'
import type { ScheduleBlock, BlockConfig } from '../types/schedule.js'

function genId(): string {
  return randomBytes(8).toString('hex')
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function createScheduleRoutes(
  store: ScheduleStore,
  onBlockChanged?: (date: string, block: ScheduleBlock) => void,
  onExecuteBlock?: (date: string, blockId: string) => Promise<void>
) {
  const api = new Hono()

  // Get day schedule
  api.get('/:date', async (c) => {
    const date = c.req.param('date')
    if (!DATE_RE.test(date)) return c.json({ error: 'Invalid date format, use YYYY-MM-DD' }, 400)
    const schedule = await store.getSchedule(date)
    return c.json(schedule)
  })

  // Save full schedule
  api.put('/:date', async (c) => {
    const date = c.req.param('date')
    if (!DATE_RE.test(date)) return c.json({ error: 'Invalid date format' }, 400)
    const body = await c.req.json<{ blocks: ScheduleBlock[] }>()
    if (!Array.isArray(body?.blocks)) return c.json({ error: 'blocks array is required' }, 400)
    await store.saveSchedule({ date, blocks: body.blocks })
    return c.json({ status: 'saved' })
  })

  // Add a block
  api.post('/:date/blocks', async (c) => {
    const date = c.req.param('date')
    if (!DATE_RE.test(date)) return c.json({ error: 'Invalid date format' }, 400)
    const body = await c.req.json<{
      type: ScheduleBlock['type']
      title: string
      startTime: string
      durationMinutes: number
      config: BlockConfig
    }>()

    if (!body?.type || !body?.title || !body?.startTime || !body?.durationMinutes || !body?.config) {
      return c.json({ error: 'type, title, startTime, durationMinutes, and config are required' }, 400)
    }

    const block: ScheduleBlock = {
      id: genId(),
      type: body.type,
      title: body.title,
      startTime: body.startTime,
      durationMinutes: body.durationMinutes,
      status: 'pending',
      config: body.config,
    }

    const schedule = await store.getSchedule(date)
    schedule.blocks.push(block)
    schedule.blocks.sort((a, b) => a.startTime.localeCompare(b.startTime))
    await store.saveSchedule(schedule)
    onBlockChanged?.(date, block)
    return c.json(block, 201)
  })

  // Update a block
  api.patch('/:date/blocks/:id', async (c) => {
    const date = c.req.param('date')
    const id = c.req.param('id')
    if (!DATE_RE.test(date)) return c.json({ error: 'Invalid date format' }, 400)
    const body = await c.req.json<Partial<ScheduleBlock>>()
    const updated = await store.updateBlock(date, id, body)
    if (!updated) return c.json({ error: 'Block not found' }, 404)
    onBlockChanged?.(date, updated)
    return c.json(updated)
  })

  // Delete a block
  api.delete('/:date/blocks/:id', async (c) => {
    const date = c.req.param('date')
    const id = c.req.param('id')
    if (!DATE_RE.test(date)) return c.json({ error: 'Invalid date format' }, 400)
    const deleted = await store.deleteBlock(date, id)
    if (!deleted) return c.json({ error: 'Block not found' }, 404)
    return c.json({ status: 'deleted' })
  })

  // Skip a block
  api.post('/:date/blocks/:id/skip', async (c) => {
    const date = c.req.param('date')
    const id = c.req.param('id')
    if (!DATE_RE.test(date)) return c.json({ error: 'Invalid date format' }, 400)
    const updated = await store.updateBlock(date, id, { status: 'skipped' })
    if (!updated) return c.json({ error: 'Block not found' }, 404)
    onBlockChanged?.(date, updated)
    return c.json(updated)
  })

  // Force-execute a block now (handled by scheduler via callback)
  api.post('/:date/blocks/:id/execute', async (c) => {
    const date = c.req.param('date')
    const id = c.req.param('id')
    if (!DATE_RE.test(date)) return c.json({ error: 'Invalid date format' }, 400)
    const schedule = await store.getSchedule(date)
    const block = schedule.blocks.find((b) => b.id === id)
    if (!block) return c.json({ error: 'Block not found' }, 404)
    if (onExecuteBlock) {
      try {
        await onExecuteBlock(date, block.id)
      } catch {
        return c.json({ error: 'Radio is not on air' }, 409)
      }
    }
    return c.json({ status: 'execute-requested', block })
  })

  return api
}
