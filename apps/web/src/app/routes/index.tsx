import { createFileRoute } from "@tanstack/react-router";

import { ServicePage } from "@/pages/service";

export const Route = createFileRoute("/")({ component: ServicePage });
