import { describe, expect, it } from 'vitest'

describe('v2 scaffold', () => {
  it('keeps core math dependencies available', async () => {
    const [{ ComputeEngine }, mathliveModule] = await Promise.all([
      import('@cortex-js/compute-engine'),
      import('mathlive'),
    ])

    expect(typeof ComputeEngine).toBe('function')
    expect(typeof mathliveModule).toBe('object')
  })
})
