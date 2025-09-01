import fs from 'fs';
import path from 'path';

interface ApiRoute {
  path: string;
  methods: string[];
  isDynamic: boolean;
  parameters?: string[];
}

interface OpenApiPath {
  [method: string]: {
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: any[];
    requestBody?: any;
    responses?: any;
  };
}

/**
 * Convert Next.js file path to OpenAPI path
 * e.g., /api/images/[id]/route.ts -> /api/images/{id}
 */
function filePathToApiPath(filePath: string): { path: string; parameters: string[] } {
  const parameters: string[] = [];
  
  // Remove src/app prefix and /route.ts suffix
  let apiPath = filePath
    .replace(/^.*\/src\/app/, '')
    .replace(/\/route\.(ts|js)$/, '');
  
  // Convert Next.js dynamic segments to OpenAPI format
  apiPath = apiPath.replace(/\[([^\]]+)\]/g, (match, param) => {
    parameters.push(param);
    return `{${param}}`;
  });
  
  return { path: apiPath, parameters };
}

/**
 * Extract HTTP methods from a route file
 */
function extractMethods(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const methods: string[] = [];
  
  // Look for exported functions named after HTTP methods
  const methodRegex = /export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/g;
  let match;
  
  while ((match = methodRegex.exec(content)) !== null) {
    methods.push(match[2]);
  }
  
  return methods;
}

/**
 * Extract request body parameters from POST/PUT/PATCH methods
 */
function extractRequestBody(filePath: string, method: string): any {
  if (!['POST', 'PUT', 'PATCH'].includes(method)) {
    return null;
  }
  
  // Check if file exists before reading
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: Route file not found for parameter extraction: ${filePath}`);
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Find the method function
  const methodRegex = new RegExp(
    `export\\s+(async\\s+)?function\\s+${method}[\\s\\S]*?\\{([\\s\\S]*?)\\n\\}`,
    'g'
  );
  
  const methodMatch = methodRegex.exec(content);
  if (!methodMatch) return null;
  
  const methodBody = methodMatch[2];
  
  // Look for request.json() parsing
  const jsonParseRegex = /const\s+(\w+)\s*=\s*await\s+request\.json\(\)/;
  const jsonMatch = jsonParseRegex.exec(methodBody);
  
  if (jsonMatch) {
    const varName = jsonMatch[1];
    
    // Look for destructuring
    const destructureRegex = new RegExp(`const\\s*\\{([^}]+)\\}\\s*=\\s*${varName}`);
    const destructureMatch = destructureRegex.exec(methodBody);
    
    if (destructureMatch) {
      // Parse destructured properties
      const properties = destructureMatch[1]
        .split(',')
        .map(p => p.trim())
        .filter(p => p && !p.includes(':')) // Skip renamed properties for now
        .reduce((acc, prop) => {
          acc[prop] = {
            type: 'string',
            description: `${prop} parameter`
          };
          return acc;
        }, {} as any);
      
      return {
        type: 'object',
        properties
      };
    }
    
    // Look for direct body field access pattern (body.fieldName)
    const bodyFieldRegex = /body\.(\w+)/g;
    const bodyFields = new Set<string>();
    let fieldMatch;
    
    while ((fieldMatch = bodyFieldRegex.exec(methodBody)) !== null) {
      const fieldName = fieldMatch[1];
      // Filter out method calls and common non-field accesses
      if (!['json', 'toString', 'valueOf', 'hasOwnProperty'].includes(fieldName)) {
        bodyFields.add(fieldName);
      }
    }
    
    // Also look for validation patterns like "!body.field"
    const validationRegex = /!body\.(\w+)/g;
    while ((fieldMatch = validationRegex.exec(methodBody)) !== null) {
      bodyFields.add(fieldMatch[1]);
    }
    
    if (bodyFields.size > 0) {
      const properties: any = {};
      
      // Check for required field validation
      const requiredFields = new Set<string>();
      const requiredCheckRegex = /!body\.(\w+)[^)]*\)/;
      const missingFieldsRegex = /Missing required fields:([^'"\]]+)/;
      
      const missingMatch = missingFieldsRegex.exec(methodBody);
      if (missingMatch) {
        // Parse required fields from error message
        const fields = missingMatch[1].split(',').map(f => f.trim());
        fields.forEach(field => requiredFields.add(field));
      }
      
      // Build properties object
      Array.from(bodyFields).forEach(field => {
        properties[field] = {
          type: 'string', // Default to string, could be enhanced with better type detection
          description: `${field} parameter${requiredFields.has(field) ? '' : ' (optional)'}`
        };
      });
      
      return {
        type: 'object',
        properties,
        required: Array.from(requiredFields)
      };
    }
    
    // Look for Zod schema validation
    const zodRegex = /(\w+Schema)\.parse\(|(\w+)\.parse\(/;
    const zodMatch = zodRegex.exec(methodBody);
    
    if (zodMatch) {
      // Try to find the schema definition
      const schemaName = zodMatch[1] || zodMatch[2];
      if (schemaName) {
        // More flexible regex to handle nested objects
        const schemaRegex = new RegExp(`const\\s+${schemaName}\\s*=\\s*z\\.object\\(\\{`, 's');
        const schemaMatch = schemaRegex.exec(content);
        
        if (schemaMatch) {
          // Find the matching closing brace for z.object
          const startIdx = schemaMatch.index + schemaMatch[0].length;
          let braceCount = 1;
          let endIdx = startIdx;
          
          while (braceCount > 0 && endIdx < content.length) {
            if (content[endIdx] === '{') braceCount++;
            if (content[endIdx] === '}') braceCount--;
            endIdx++;
          }
          
          const schemaBody = content.substring(startIdx, endIdx - 1);
          const properties: any = {};
          
          // Match top-level property definitions
          const propRegex = /^\s*(\w+):\s*z\.(\w+)[^,]*/gm;
          let propMatch;
          
          while ((propMatch = propRegex.exec(schemaBody)) !== null) {
            const [fullMatch, propName, propType] = propMatch;
            
            // Determine the type
            let type = 'string';
            if (propType === 'number') type = 'number';
            else if (propType === 'boolean') type = 'boolean';
            else if (propType === 'array') type = 'array';
            else if (propType === 'object') type = 'object';
            else if (propType === 'enum') type = 'string';
            
            // Check if it's optional
            const isOptional = fullMatch.includes('.optional()');
            
            properties[propName] = {
              type,
              description: `${propName} parameter${isOptional ? ' (optional)' : ''}`
            };
          }
          
          return {
            type: 'object',
            properties,
            required: Object.keys(properties).filter(key => 
              !properties[key].description.includes('(optional)')
            )
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract JSDoc comments for a specific method
 */
function extractJSDoc(filePath: string, method: string): any {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Look for JSDoc comments before the method
  const jsDocRegex = new RegExp(
    `/\\*\\*[\\s\\S]*?\\*/\\s*export\\s+(async\\s+)?function\\s+${method}`,
    'g'
  );
  
  const match = jsDocRegex.exec(content);
  if (!match) return null;
  
  const jsDoc = match[0].split('export')[0];
  
  // Parse @swagger or @openapi annotations
  const swaggerMatch = jsDoc.match(/@(swagger|openapi)\s+([\s\S]*?)\*\//);
  if (swaggerMatch) {
    try {
      // Extract YAML or JSON from comment
      const docContent = swaggerMatch[2]
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, ''))
        .join('\n');
      
      // For now, return the raw content - in production, you'd parse YAML/JSON
      return { raw: docContent };
    } catch (e) {
      console.warn(`Failed to parse JSDoc for ${filePath}:${method}`, e);
    }
  }
  
  // Extract basic JSDoc tags
  const summary = jsDoc.match(/@summary\s+(.+)/)?.[1];
  const description = jsDoc.match(/@description\s+([\s\S]+?)(?=@|\*\/)/)?.[1]?.trim();
  const tags = jsDoc.match(/@tags?\s+(.+)/)?.[1]?.split(',').map(t => t.trim());
  
  return {
    summary,
    description,
    tags
  };
}

/**
 * Recursively scan directory for route files
 */
function scanDirectory(dir: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  
  if (!fs.existsSync(dir)) {
    console.log(`[API Scanner] Directory does not exist: ${dir}`);
    return routes;
  }
  
  console.log(`[API Scanner] Scanning directory: ${dir}`);
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      routes.push(...scanDirectory(fullPath));
    } else if (file === 'route.ts' || file === 'route.js') {
      // Found a route file
      const { path: apiPath, parameters } = filePathToApiPath(fullPath);
      const methods = extractMethods(fullPath);
      
      if (methods.length > 0) {
        routes.push({
          path: apiPath,
          methods,
          isDynamic: parameters.length > 0,
          parameters: parameters.length > 0 ? parameters : undefined
        });
      }
    }
  }
  
  return routes;
}

/**
 * Generate OpenAPI paths from discovered routes
 */
export function generateOpenApiPaths(apiDir: string): Record<string, OpenApiPath> {
  const routes = scanDirectory(apiDir);
  const paths: Record<string, OpenApiPath> = {};
  
  for (const route of routes) {
    const pathObj: OpenApiPath = {};
    
    for (const method of route.methods) {
      const methodLower = method.toLowerCase();
      
      // Get JSDoc documentation if available
      // Convert back from OpenAPI format to Next.js format for file path
      const nextJsPath = route.path.replace(/\{([^}]+)\}/g, '[$1]');
      const routeFile = path.join(apiDir, nextJsPath.replace(/^\/api/, ''), 'route.ts');
      const jsDoc = fs.existsSync(routeFile) ? extractJSDoc(routeFile, method) : null;
      
      // Extract tag from path structure - use first folder after /api/
      const pathParts = route.path.split('/').filter(p => p);
      let tag = 'default';
      if (pathParts.length > 1) {
        tag = pathParts[1]; // First folder after 'api'
        // Capitalize first letter and handle hyphenated names
        tag = tag.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      }
      
      // Build method definition
      pathObj[methodLower] = {
        summary: jsDoc?.summary || `${method} ${route.path}`,
        description: jsDoc?.description,
        tags: jsDoc?.tags || [tag],
        responses: {
          '200': {
            description: 'Successful response'
          }
        }
      };
      
      // Add parameters for dynamic routes
      if (route.isDynamic && route.parameters) {
        pathObj[methodLower].parameters = route.parameters.map(param => ({
          name: param,
          in: 'path',
          required: true,
          schema: {
            type: 'string'
          },
          description: `${param} parameter`
        }));
      }
      
      // Add request body for POST/PUT/PATCH methods
      const requestBodySchema = extractRequestBody(routeFile, method);
      if (requestBodySchema) {
        pathObj[methodLower].requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: requestBodySchema
            }
          }
        };
      }
    }
    
    paths[route.path] = pathObj;
  }
  
  return paths;
}

/**
 * Discover all API routes in a Next.js app directory
 */
export function discoverApiRoutes(baseDir: string = process.cwd()): ApiRoute[] {
  const apiDir = path.join(baseDir, 'src', 'app', 'api');
  return scanDirectory(apiDir);
}

/**
 * Get a formatted list of all endpoints
 */
export function getEndpointsList(baseDir?: string): string[] {
  const routes = discoverApiRoutes(baseDir);
  const endpoints: string[] = [];
  
  for (const route of routes) {
    for (const method of route.methods) {
      endpoints.push(`${method} ${route.path}`);
    }
  }
  
  return endpoints.sort();
}