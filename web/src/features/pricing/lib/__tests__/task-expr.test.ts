/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import type { BillingUsageSchema, ModelUsageHidden } from '../../types'
import {
  orderTaskMatrixRowsForPublish,
  setTaskMatrixRowHiddenState,
  setTaskUsageHiddenValue,
  taskMatrixHasVisibleRow,
  taskMatrixRowVisibility,
  taskMatrixToTiers,
  type TaskMatrixRow,
} from '../task-expr'

const schema: BillingUsageSchema = {
  seconds: { type: 'number', unit: 'second' },
  resolution: { enum: ['480p', '768p', '1080p'] },
}

function row(resolution: string, seconds: number): TaskMatrixRow {
  return {
    combination: { resolution },
    constant: 0,
    unitPrices: { seconds },
  }
}

const rows = [row('480p', 1), row('768p', 2), row('1080p', 3)]

describe('task usage visibility', () => {
  it('deleted values hide a row entirely while hidden values keep it visible', () => {
    expect(taskMatrixRowVisibility(rows[0], undefined)).toBe('visible')
    expect(
      taskMatrixRowVisibility(rows[0], { resolution: { '480p': 'hidden' } })
    ).toBe('hidden')
    expect(
      taskMatrixRowVisibility(rows[0], { resolution: { '480p': 'deleted' } })
    ).toBe('deleted')
    expect(
      taskMatrixRowVisibility(rows[2], {
        resolution: { '480p': 'deleted' },
      })
    ).toBe('visible')
  })

  it('restoring a value removes its record and prunes empty fields', () => {
    expect(
      setTaskUsageHiddenValue(
        { resolution: { '480p': 'hidden' } },
        'resolution',
        '480p',
        null
      )
    ).toEqual({})
    expect(
      setTaskUsageHiddenValue({}, 'resolution', '480p', 'deleted')
    ).toEqual({ resolution: { '480p': 'deleted' } })
  })

  it('requires at least one visible row', () => {
    expect(taskMatrixHasVisibleRow(rows, undefined)).toBe(true)
    expect(
      taskMatrixHasVisibleRow(rows, {
        resolution: { '480p': 'deleted', '768p': 'deleted' },
      })
    ).toBe(true)
    expect(
      taskMatrixHasVisibleRow(rows, {
        resolution: { '480p': 'deleted', '768p': 'deleted', '1080p': 'hidden' },
      })
    ).toBe(false)
  })

  it('sets every value of a row combination together', () => {
    const combination: TaskMatrixRow = {
      combination: { resolution: '768p', mode: 'pro' },
      constant: 0,
      unitPrices: { seconds: 2 },
    }
    expect(setTaskMatrixRowHiddenState({}, combination, 'deleted')).toEqual({
      resolution: { '768p': 'deleted' },
      mode: { pro: 'deleted' },
    })
  })
})

describe('publishing hidden task rows', () => {
  it('keeps a visible row as the unconditioned fallback', () => {
    const hidden: ModelUsageHidden = {
      resolution: { '1080p': 'hidden', '768p': 'deleted' },
    }
    const ordered = orderTaskMatrixRowsForPublish(rows, hidden)
    expect(ordered).toHaveLength(3)
    expect(ordered.at(-1)?.combination.resolution).toBe('480p')
    const tiers = taskMatrixToTiers({ rows: ordered }, schema)
    expect(tiers.at(-1)?.conditions).toEqual([])
    expect(tiers.at(-1)?.unitPrices.seconds).toBe(1)
  })

  it('leaves rows untouched when the fallback is already visible', () => {
    expect(
      orderTaskMatrixRowsForPublish(rows, {
        resolution: { '480p': 'hidden' },
      })
    ).toBe(rows)
  })
})
