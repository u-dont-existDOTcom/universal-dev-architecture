export async function dispatchExecutionProvider({
  directive,
  dispatchArguments,
  openAiDispatcher,
  claudeDispatcher,
}) {
  const provider = directive?.executionProvider ?? 'OPENAI';
  if (provider === 'OPENAI') {
    if (typeof openAiDispatcher !== 'function') throw new Error('OPENAI_DISPATCHER_REQUIRED');
    return openAiDispatcher(dispatchArguments);
  }
  if (provider === 'ANTHROPIC') {
    if (typeof claudeDispatcher !== 'function') throw new Error('CLAUDE_DISPATCHER_REQUIRED');
    return claudeDispatcher(dispatchArguments);
  }
  throw new Error('UNSUPPORTED_EXECUTION_PROVIDER');
}
