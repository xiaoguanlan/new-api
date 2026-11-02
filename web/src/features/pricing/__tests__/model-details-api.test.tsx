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
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { ModelDetailsApi } from '../components/model-details-api'
import type { PricingModel } from '../types'

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://api.example.com' },
  }),
}))

vi.mock('@/components/ai-elements/code-block', () => ({
  CodeBlock: (props: { code: string }) => (
    <pre data-testid='code-sample'>{props.code}</pre>
  ),
  CodeBlockCopyButton: () => null,
}))

function taskModel(): PricingModel {
  return {
    id: 1,
    model_name: 'minimax_h3_zm_u22',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    supported_endpoint_types: ['openai'],
    request_parameters: [
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: { en: 'Text prompt', zh: '文本提示词' },
      },
      {
        name: 'duration',
        type: 'integer',
        min: 1,
        max: 15,
        default: 5,
        description: { en: 'Video duration', zh: '视频时长' },
      },
      {
        name: 'resolution',
        type: 'enum',
        enum: ['720p', '1080p'],
        default: '720p',
        description: { en: 'Output resolution', zh: '输出分辨率' },
      },
      { name: 'seed', type: 'integer', min: 1, max: 999999999999999 },
    ],
  }
}

it('renders the plugin-declared request parameters instead of chat params', () => {
  render(
    <ModelDetailsApi
      model={taskModel()}
      endpointMap={{ openai: { path: '/v1/chat/completions' } }}
    />
  )

  expect(screen.getByText('prompt')).toBeInTheDocument()
  expect(screen.getByText('duration')).toBeInTheDocument()
  expect(screen.getByText('resolution')).toBeInTheDocument()
  expect(screen.getByText('seed')).toBeInTheDocument()
  expect(screen.getByText('required')).toBeInTheDocument()
  expect(screen.getByText('Text prompt')).toBeInTheDocument()
  expect(screen.getByText('Video duration')).toBeInTheDocument()
  expect(screen.queryByText('temperature')).not.toBeInTheDocument()
})

it('builds a /v1/videos sample from the declared parameters', () => {
  render(
    <ModelDetailsApi
      model={taskModel()}
      endpointMap={{ openai: { path: '/v1/chat/completions' } }}
    />
  )

  const code = screen.getByTestId('code-sample').textContent ?? ''
  expect(code).toContain('https://api.example.com/v1/videos')
  expect(code).toContain('"model": "minimax_h3_zm_u22"')
  expect(code).toContain('"prompt": "A serene mountain lake at sunrise."')
  expect(code).toContain('"duration": 5')
  expect(code).toContain('"resolution": "720p"')
  expect(code).not.toContain('"seed"')
  expect(code).not.toContain('/v1/chat/completions')
  expect(code).not.toContain('messages')
})
