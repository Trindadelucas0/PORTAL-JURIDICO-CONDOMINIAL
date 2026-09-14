import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { teamService } from "@/lib/services/team-service";

export async function GET() {
  try {
    await requireAdmin();
    const items = await teamService.list();
    return ok(items);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    await requireAdmin();
    const body = await request.json();
    const result = await teamService.create(body);
    return created(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertCsrf(request);
    await requireAdmin();
    const body = await request.json();
    const row = await teamService.patch(body);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
