import { createFileRoute } from "@tanstack/react-router";

import { ServicePage } from "@/pages/service";

export const Route = createFileRoute("/agent-check")({ component: ServicePage });
