# Folder-Level Developer Guides

This project keeps developer-facing flow documentation close to the code it explains. Before changing a module or infrastructure layer, start with the matching folder guide, then read the code files referenced there.

## Source Guides

- `src/docs/README.md`: source tree startup flow and folder responsibilities.
- `src/modules/docs/README.md`: feature module conventions.
- `src/modules/auth/docs/README.md`: auth flows, token lifecycle, dependencies, and risks.
- `src/modules/user/docs/README.md`: profile and admin user flows, cache behavior, dependencies, and risks.
- `src/modules/upload/docs/README.md`: two-stage upload flow, storage provider architecture, encryption, dependencies, and risks.
- `src/modules/health/docs/README.md`: health and ping endpoint behavior.
- `src/common/docs/README.md`: global request pipeline, guards, interceptors, filters, responses, and idempotency.
- `src/config/docs/README.md`: environment validation and typed config flow.
- `src/database/docs/README.md`: Prisma service, repository pattern, and model access.
- `src/jobs/docs/README.md`: background queue producer and processor flow.
- `src/shared/docs/README.md`: cache, encryption, and reusable utility ownership.
- `src/lib/docs/README.md`: non-provider helper utilities such as Multer setup.

## Non-Source Guides

- `prisma/docs/README.md`: schema layout, model responsibilities, and migration flow.
- `docker/docs/README.md`: Docker and compose startup/deployment flow.

## Documentation Rule For New Work

When adding a new feature folder, also add `docs/README.md` inside that folder. The guide should answer:

1. What the folder owns.
2. What request, service, job, or data flow it implements.
3. Which files are the main entry points.
4. Which other modules, services, environment variables, and database models it depends on.
5. Which parts are complex or risky for future changes.

