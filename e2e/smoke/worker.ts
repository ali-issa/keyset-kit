/**
 * workerd entry: a module worker whose fetch handler runs the checks and
 * answers with the result as JSON.
 * @ref https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
 */
import { runChecks } from './checks.ts';

export default {
  async fetch(request: Request): Promise<Response> {
    const agent = request.headers.get('user-agent') ?? 'workerd';
    return Response.json(await runChecks(agent));
  },
};
