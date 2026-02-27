prisma:error 
Invalid `prisma.rolePermission.upsert()` invocation:

{
  where: {
    roleId_permissionId_sectionId_formFieldId_moduleId: {
      roleId: "cmlahh3j00021u7bk38unzz7a",
      permissionId: "2",
      formFieldId: null,
      moduleId: "cmlagnnjv000wu7bk483keulc",
+     sectionId: String
    }
  },
  update: {
    formId: "cmlagnofo000yu7bkzk6kklju",
    granted: true,
    canDelegate: false
  },
  create: {
    roleId: "cmlahh3j00021u7bk38unzz7a",
    permissionId: "2",
    moduleId: "cmlagnnjv000wu7bk483keulc",
    formId: "cmlagnofo000yu7bkzk6kklju",
    sectionId: null,
    formFieldId: null,
    granted: true,
    canDelegate: false
  }
}

Argument `sectionId` must not be null.
prisma:query ROLLBACK
[v0] Failed to update role permissions: PrismaClientValidationError: 
Invalid `prisma.rolePermission.upsert()` invocation:

{
  where: {
    roleId_permissionId_sectionId_formFieldId_moduleId: {
      roleId: "cmlahh3j00021u7bk38unzz7a",
      permissionId: "2",
      formFieldId: null,
      moduleId: "cmlagnnjv000wu7bk483keulc",
+     sectionId: String
    }
  },
  update: {
    formId: "cmlagnofo000yu7bkzk6kklju",
    granted: true,
    canDelegate: false
  },
  create: {
    roleId: "cmlahh3j00021u7bk38unzz7a",
    permissionId: "2",
    moduleId: "cmlagnnjv000wu7bk483keulc",
    formId: "cmlagnofo000yu7bkzk6kklju",
    sectionId: null,
    formFieldId: null,
    granted: true,
    canDelegate: false
  }
}

Argument `sectionId` must not be null.
    at Nn (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:29:1363)
    at ei.handleRequestError (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:121:6911)
    at ei.handleAndLogRequestError (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:121:6593)
    at ei.request (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:121:6300)
    at async a (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:130:9551)
    at async _prisma__WEBPACK_IMPORTED_MODULE_0__.prisma.$transaction.timeout (webpack-internal:///(rsc)/./lib/database.ts:478:17)
    at async Proxy._transactionWithCallback (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:130:8120)
    at async updateRolePermissions (webpack-internal:///(rsc)/./lib/database.ts:476:9)
    at async PUT (webpack-internal:///(rsc)/./app/api/role-permissions/route.ts:87:25)
    at async C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:55831
    at async eO.execute (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:46527)
    at async eO.handle (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:57165)
    at async doRender (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1352:42)
    at async cacheEntry.responseCache.get.routeKind (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1574:28)
    at async DevServer.renderToResponseWithComponentsImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1482:28)
    at async DevServer.renderPageComponent (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1908:24)
    at async DevServer.renderToResponseImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1946:32)
    at async DevServer.pipeImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:921:25)
    at async NextNodeServer.handleCatchallRenderRequest (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\next-server.js:272:17)
    at async DevServer.handleRequestImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:817:17)
    at async C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\dev\next-dev-server.js:339:20
    at async Span.traceAsyncFn (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\trace\trace.js:154:20)
    at async DevServer.handleRequest (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\dev\next-dev-server.js:336:24)
    at async invokeRender (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\lib\router-server.js:173:21)
    at async handleRequest (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\lib\router-server.js:350:24)
    at async requestHandlerImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\lib\router-server.js:374:13)
    at async Server.requestListener (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\lib\start-server.js:141:13) {
  clientVersion: '6.19.0'
}
[v0] Error in PUT /api/role-permissions: PrismaClientValidationError:
Invalid `prisma.rolePermission.upsert()` invocation:

{
  where: {
    roleId_permissionId_sectionId_formFieldId_moduleId: {
      roleId: "cmlahh3j00021u7bk38unzz7a",
      permissionId: "2",
      formFieldId: null,
      moduleId: "cmlagnnjv000wu7bk483keulc",
+     sectionId: String
    }
  },
  update: {
    formId: "cmlagnofo000yu7bkzk6kklju",
    granted: true,
    canDelegate: false
  },
  create: {
    roleId: "cmlahh3j00021u7bk38unzz7a",
    permissionId: "2",
    moduleId: "cmlagnnjv000wu7bk483keulc",
    formId: "cmlagnofo000yu7bkzk6kklju",
    sectionId: null,
    formFieldId: null,
    granted: true,
    canDelegate: false
  }
}

Argument `sectionId` must not be null.
    at Nn (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:29:1363)
    at ei.handleRequestError (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:121:6911)
    at ei.handleAndLogRequestError (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:121:6593)
    at ei.request (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:121:6300)
    at async a (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:130:9551)
    at async _prisma__WEBPACK_IMPORTED_MODULE_0__.prisma.$transaction.timeout (webpack-internal:///(rsc)/./lib/database.ts:478:17)
    at async Proxy._transactionWithCallback (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\@prisma+client@6.19.0_prism_0ade0c2032e7f19289902b884120cfab\node_modules\@prisma\client\runtime\library.js:130:8120)
    at async updateRolePermissions (webpack-internal:///(rsc)/./lib/database.ts:476:9)
    at async PUT (webpack-internal:///(rsc)/./app/api/role-permissions/route.ts:87:25)
    at async C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:55831
    at async eO.execute (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:46527)
    at async eO.handle (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:57165)
    at async doRender (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1352:42)
    at async cacheEntry.responseCache.get.routeKind (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1574:28)
    at async DevServer.renderToResponseWithComponentsImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1482:28)
    at async DevServer.renderPageComponent (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1908:24)
    at async DevServer.renderToResponseImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:1946:32)
    at async DevServer.pipeImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:921:25)
    at async NextNodeServer.handleCatchallRenderRequest (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\next-server.js:272:17)
    at async DevServer.handleRequestImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\base-server.js:817:17)
    at async C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\dev\next-dev-server.js:339:20
    at async Span.traceAsyncFn (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\trace\trace.js:154:20)
    at async DevServer.handleRequest (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\dev\next-dev-server.js:336:24)
    at async invokeRender (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\lib\router-server.js:173:21)
    at async handleRequest (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\lib\router-server.js:350:24)
    at async requestHandlerImpl (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\lib\router-server.js:374:13)
    at async Server.requestListener (C:\Users\p\Desktop\New folder\erp-production-code\node_modules\.pnpm\next@14.2.16_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\dist\server\lib\start-server.js:141:13) {
  clientVersion: '6.19.0'
}
 PUT /api/role-permissions 500 in 9066ms