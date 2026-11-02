export type ChatResult = {
  model?: string
  choices?: { message?: { content?: string | { text?: string }[] }; finish_reason?: string | null }[]
  output_text?: string
  completion_status?: string
  incomplete_reason?: string | null
  warning?: string
}

export function chatCompletionWarning(result: ChatResult) {
  const reason = result.choices?.[0]?.finish_reason || ''
  if (result.completion_status !== 'incomplete' && !['length', 'max_tokens', 'max_output_tokens', 'content_filter'].includes(reason)) return ''
  return result.warning || '已保留部分内容：模型输出未完成，请继续生成剩余内容。'
}
