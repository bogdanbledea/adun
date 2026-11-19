import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { build } from '../lib/build.ts'
import { renderWithProviders } from '../test/render.tsx'
import { Footer } from './Footer.tsx'

describe('Footer', () => {
  it('shows the version and the short commit, with the full commit on hover', () => {
    renderWithProviders(<Footer />)
    const line = screen.getByText(`v${build.version} · ${build.shortCommit}`)
    expect(line.getAttribute('title')).toBe(build.commit)
  })

  it('is built from the version in package.json and a commit read from git', () => {
    expect(build.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(build.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(build.shortCommit).toBe(build.commit.slice(0, 7))
  })
})
