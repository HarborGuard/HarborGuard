import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    // Use Docker Hub's public search API
    const dockerHubUrl = `https://index.docker.io/v1/search?q=${encodeURIComponent(query)}&n=25`
    
    const response = await fetch(dockerHubUrl, {
      headers: {
        'User-Agent': 'HarborGuard/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Docker Hub API error: ${response.status}`)
    }

    const data = await response.json()
    
    // Sort results: official images first, then by star count
    const sortedResults = data.results?.sort((a: any, b: any) => {
      // Official images first
      if (a.is_official && !b.is_official) return -1
      if (!a.is_official && b.is_official) return 1
      
      // Then by star count (descending)
      return b.star_count - a.star_count
    }) || []

    return NextResponse.json({ 
      results: sortedResults.slice(0, 10) // Limit to 10 results
    })

  } catch (error) {
    return apiError(error, 'Failed to search Docker Hub');
  }
}