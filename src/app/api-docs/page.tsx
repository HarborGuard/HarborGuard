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
    <div className="min-h-screen bg-background">
      <div className="swagger-ui-wrapper">
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
          border-radius: 0.5rem;
          padding: 1rem;
        }
        
        /* Better integration with HarborGuard's theme */
        .swagger-ui .btn {
          border-radius: 0.375rem;
        }
        
        .swagger-ui select {
          border-radius: 0.375rem;
        }
        
        .swagger-ui .responses-inner {
          background: var(--card);
          border-radius: 0.375rem;
        }
        
        .swagger-ui .opblock {
          border-radius: 0.375rem;
          margin-bottom: 1rem;
        }
        
        .swagger-ui .opblock-summary {
          border-radius: 0.375rem;
        }
      `}</style>
    </div>
  );
}