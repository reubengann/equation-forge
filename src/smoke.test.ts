import { describe, expect, it } from 'vitest'

describe('app scaffold', () => {
  it('keeps core math dependencies available', async () => {
    const mathliveModule = await import('mathlive')

    expect(typeof mathliveModule).toBe('object')
  })
})
