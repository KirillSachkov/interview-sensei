import { createFileRoute } from "@tanstack/react-router";

import { ArchivePage } from "@/pages/archive";

export const Route = createFileRoute("/archive")({ component: ArchivePage });
