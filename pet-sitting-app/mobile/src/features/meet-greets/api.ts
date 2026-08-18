import type { CreateMeetGreetInput, MeetGreetRequest } from "@fido/shared";
import { apiFetch } from "@/lib/api";

export function createMeetGreet(input: CreateMeetGreetInput): Promise<MeetGreetRequest> {
  return apiFetch<MeetGreetRequest>("/meet-greets", { method: "POST", body: input });
}
