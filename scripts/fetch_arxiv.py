#!/usr/bin/env python3
"""
Fetch latest papers from arXiv matching biostatistics/medical/clinical keywords
and large language models. Parses Atom XML response into JSON format.
"""

import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
import os
import sys

def fetch_arxiv_papers():
    """
    Query arXiv API and fetch papers matching specified criteria.
    
    Returns:
        dict: Contains generated_at_utc, search_query, count, and papers list
        None: If fetch fails
    """
    
    # ArXiv OpenAPI endpoint
    base_url = "http://export.arxiv.org/api/query"
    
    # Build search query: LLM/RAG papers in biostatistics/medical/clinical
    search_query = (
        '("large language model" OR LLM OR RAG) AND '
        '(biostatistics OR medical OR clinical)'
    )
    
    # Parameters for API request
    params = {
        'search_query': search_query,
        'start': 0,
        'max_results': 15,
        'sortBy': 'submittedDate',
        'sortOrder': 'descending'
    }
    
    # Build URL
    url = base_url + '?' + urllib.parse.urlencode(params)
    
    # Fetch data from arXiv API
    try:
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0')
        with urllib.request.urlopen(req) as response:
            xml_data = response.read()
    except Exception as e:
        print(f"Error fetching arXiv data: {e}", file=sys.stderr)
        return None
    
    # Parse Atom XML response
    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as e:
        print(f"Error parsing XML: {e}", file=sys.stderr)
        return None
    
    # Define XML namespaces
    namespaces = {
        'atom': 'http://www.w3.org/2005/Atom',
        'arxiv': 'http://arxiv.org/schemas/atom'
    }
    
    # Extract papers from entries
    papers = []
    entries = root.findall('atom:entry', namespaces)
    
    for entry in entries:
        paper = {}
        
        # Extract title
        title_elem = entry.find('atom:title', namespaces)
        paper['title'] = title_elem.text.strip() if title_elem is not None else ''
        
        # Extract authors
        authors = []
        for author in entry.findall('atom:author', namespaces):
            name_elem = author.find('atom:name', namespaces)
            if name_elem is not None:
                authors.append(name_elem.text.strip())
        paper['authors'] = authors
        
        # Extract abstract
        summary_elem = entry.find('atom:summary', namespaces)
        abstract_text = summary_elem.text if summary_elem is not None else ''
        paper['abstract'] = abstract_text.strip() if abstract_text else ''
        
        # Extract URLs and arxiv ID
        arxiv_id = None
        pdf_url = None
        arxiv_url = None
        
        for link in entry.findall('atom:link', namespaces):
            href = link.get('href', '')
            rel = link.get('rel', '')
            link_type = link.get('type', '')
            
            if rel == 'alternate':
                arxiv_url = href
                # Extract arxiv ID from URL (format: http://arxiv.org/abs/XXXX.XXXXX)
                arxiv_id = href.split('/abs/')[-1]
            elif link_type == 'application/pdf':
                pdf_url = href
        
        # Construct PDF URL if not found
        if arxiv_id and not pdf_url:
            pdf_url = f"http://arxiv.org/pdf/{arxiv_id}.pdf"
        
        paper['pdf_url'] = pdf_url or ''
        paper['arxiv_url'] = arxiv_url or ''
        
        # Extract published and updated timestamps
        published_elem = entry.find('atom:published', namespaces)
        paper['published'] = published_elem.text if published_elem is not None else ''
        
        updated_elem = entry.find('atom:updated', namespaces)
        paper['updated'] = updated_elem.text if updated_elem is not None else ''
        
        # Extract categories
        categories = []
        for category in entry.findall('atom:category', namespaces):
            term = category.get('term', '')
            if term:
                categories.append(term)
        paper['categories'] = categories
        
        papers.append(paper)
    
    # Prepare output JSON structure
    output = {
        'generated_at_utc': datetime.utcnow().isoformat() + 'Z',
        'search_query': search_query,
        'count': len(papers),
        'papers': papers
    }
    
    return output


def main():
    """Main function to fetch and save papers."""
    
    # Determine output path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output_dir = os.path.join(project_root, 'assets')
    output_file = os.path.join(output_dir, 'arxiv.json')
    
    # Create assets directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Fetch papers
    result = fetch_arxiv_papers()
    
    if result is None:
        print("Failed to fetch papers from arXiv", file=sys.stderr)
        sys.exit(1)
    
    # Write to JSON file
    try:
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"✓ Successfully fetched {result['count']} papers")
        print(f"✓ Saved to {output_file}")
    except IOError as e:
        print(f"Error writing to file: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
