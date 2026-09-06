import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MILLER_THEME_NAMES,
  normalizeMillerThemeName,
  resolveMillerThemeIndex,
} from '../src/millerThemePreference.js'

test('quiet-sharing mode keeps Miller North out of the main theme switcher', () => {
  assert.deepEqual(MILLER_THEME_NAMES, ['Classic', 'Jade', 'Violet', 'Rose'])
  assert.equal(MILLER_THEME_NAMES.includes('Gold'), false)
  assert.equal(MILLER_THEME_NAMES.includes('North'), false)
})

test('retired Gold preferences fall back safely to Classic', () => {
  assert.equal(normalizeMillerThemeName('Gold'), 'Classic')
  assert.equal(resolveMillerThemeIndex({ legacyIndex: '2' }), 0)
  assert.equal(resolveMillerThemeIndex({ savedName: 'Gold' }), 0)
})

test('legacy theme indexes retain their original intended themes after Gold retirement', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((legacyIndex) => resolveMillerThemeIndex({ legacyIndex })),
    [0, 1, 0, 2, 3, 0],
  )
})
