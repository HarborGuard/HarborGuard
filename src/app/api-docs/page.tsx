'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen">Loading API Documentation...</div>
});

export default function ApiDocs() {
  useEffect(() => {
    // Suppress React strict mode warnings for Swagger UI's deprecated lifecycle methods
    const originalError = console.error;
    const originalWarn = console.warn;
    
    const suppressedWarnings = [
      'UNSAFE_componentWillReceiveProps',
      'UNSAFE_componentWillMount',
      'componentWillReceiveProps',
      'componentWillMount'
    ];
    
    const filterConsole = (method: typeof console.error) => (...args: any[]) => {
      const stringifiedArgs = args.join(' ');
      const shouldSuppress = suppressedWarnings.some(warning => 
        stringifiedArgs.includes(warning)
      );
      
      if (!shouldSuppress) {
        method.apply(console, args);
      }
    };
    
    console.error = filterConsole(originalError);
    console.warn = filterConsole(originalWarn);
    
    // Cleanup: restore original console methods
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="px-6 py-8 border-b border-white/10">
        <p className="text-caption uppercase tracking-headline text-muted-foreground/30 mb-1">Developer</p>
        <h1 className="text-2xl tracking-tight text-foreground">API Reference</h1>
        <p className="text-body-sm uppercase tracking-widest text-muted-foreground mt-1">
          Interactive REST API documentation — explore endpoints and try requests live
        </p>
      </div>
      <div className="swagger-ui-wrapper flex-1">
        <SwaggerUI
          url="/api/openapi.json"
          docExpansion="list"
          defaultModelsExpandDepth={-1}
          displayRequestDuration={true}
          filter={true}
          showExtensions={true}
          showCommonExtensions={true}
        />
      </div>
      <style jsx global>{`
        .swagger-ui-wrapper {
          background: var(--background);
        }

        .swagger-ui .topbar {
          display: none;
        }

        .swagger-ui .info {
          margin: 2rem 0;
        }

        .swagger-ui .scheme-container {
          background: var(--card);
          border-radius: 0;
          padding: 1rem;
        }

        /* Sharp corners to match HarborGuard's 0px radius idiom */
        .swagger-ui .btn {
          border-radius: 0;
        }

        .swagger-ui select {
          border-radius: 0;
        }

        .swagger-ui .responses-inner {
          background: var(--card);
          border-radius: 0;
        }

        .swagger-ui .opblock {
          border-radius: 0;
          margin-bottom: 1rem;
        }

        .swagger-ui .opblock-summary {
          border-radius: 0;
        }
      `}</style>
    </div>
  );
}