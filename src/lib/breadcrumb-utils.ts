export interface BreadcrumbItem {
  label: string;
  href?: string;
}

function capitalizeWords(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  // Remove leading slash and split by '/'
  const segments = pathname.split('/').filter(Boolean);
  
  if (segments.length === 0) {
    return [{ label: 'Dashboard', href: '/' }];
  }
  
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/' }
  ];
  
  let currentPath = '';
  
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === segments.length - 1;
    
    // Handle special cases for better labels
    let label = segment;
    
    // Decode URL encoded segments
    label = decodeURIComponent(label);
    
    // Special handling for known routes
    switch (segment) {
      case 'image':
        label = 'Images';
        break;
      case 'scan':
        label = 'Scan';
        break;
      case 'library':
        label = 'Library';
        break;
      case 'repositories':
        label = 'Repositories';
        break;
      case 'audit-logs':
        label = 'Audit Logs';
        break;
      case 'api-docs':
        label = 'API Documentation';
        break;
      case '404':
        label = 'Not Found';
        break;
      default:
        // For image names, scan IDs, etc., show them as-is or truncate if too long
        if (label.length > 30) {
          label = label.substring(0, 27) + '...';
        }
        // If it looks like a UUID or hash (all lowercase, contains numbers), keep as-is
        else if (!/^[a-z0-9-]+$/.test(label)) {
          // Otherwise, capitalize words
          label = capitalizeWords(label);
        }
        break;
    }
    
    breadcrumbs.push({
      label,
      href: isLast ? undefined : currentPath
    });
  });
  
  return breadcrumbs;
}