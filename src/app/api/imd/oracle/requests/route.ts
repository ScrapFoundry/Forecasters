import { getOracleRequests } from "@/lib/imd/client";
import { respond } from "@/lib/imd/respond";

export async function GET() {
  return respond(await getOracleRequests(), 10);
}
