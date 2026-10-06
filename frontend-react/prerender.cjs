const fs = require('fs');
const path = require('path');

// Array of routes to statically pre-render for search engine crawlers (SEO)
const routes = ['/', '/about', '/faq', '/docs', '/contact'];

async function prerender() {
  const distPath = path.resolve(__dirname, 'dist');
  if (!fs.existsSync(distPath)) {
    console.error('Build directory not found. Please run: npm run build');
    return;
  }

  const template = fs.readFileSync(path.resolve(distPath, 'index.html'), 'utf8');

  for (const route of routes) {
    const filename = route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
    const filepath = path.join(distPath, filename);

    // Create subdirectories if they don't exist
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let html = template;

    // Define route-specific SEO Meta parameters
    let title = "BinaryWebEngine | Enterprise Linux Security Monitoring Platform";
    let description = "BinaryWebEngine is an all-in-one enterprise security monitoring platform for Linux. WAF, HIDS, NIDS, ML anomaly detection, kill chain, and threat intelligence in a single engine.";
    let jsonLd = {};

    if (route === '/') {
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "BinaryWebEngine",
        "operatingSystem": "Linux",
        "applicationCategory": "SecurityApplication",
        "description": "All-in-one Enterprise Linux Security Monitoring Platform with WAF, HIDS, NIDS, and ML anomaly detection.",
        "offers": {
          "@type": "Offer",
          "price": "0.00",
          "priceCurrency": "USD"
        },
        "author": {
          "@type": "Organization",
          "name": "BinaryShielders",
          "url": "https://binarywebengine.equisaas-bd.com"
        }
      };
    } else if (route === '/docs') {
      title = "Documentation | BinaryWebEngine";
      description = "Complete setup, configuration, and developer guides for WAF, HIDS, and ML anomaly detection on Linux systems.";
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        "headline": "BinaryWebEngine Documentation",
        "description": "Complete setup and configuration guides for WAF, HIDS, and ML anomaly detection on Linux systems.",
        "mainEntityOfPage": "https://binarywebengine.equisaas-bd.com/docs",
        "author": {
          "@type": "Organization",
          "name": "BinaryShielders"
        }
      };
    } else if (route === '/faq') {
      title = "FAQ | BinaryWebEngine";
      description = "Frequently asked questions about BinaryWebEngine features, WAF rules, and system deployments.";
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is BinaryWebEngine?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "BinaryWebEngine is an all-in-one enterprise security monitoring platform for Linux servers, combining WAF, HIDS, NIDS, and ML anomaly detection in a single engine."
            }
          },
          {
            "@type": "Question",
            "name": "How do I deploy BinaryWebEngine?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "You can deploy the Edge API to Cloudflare Workers using Wrangler, and the static frontend command center to Firebase Hosting."
            }
          }
        ]
      };
    } else if (route === '/about') {
      title = "About Us | BinaryWebEngine";
      description = "Meet Team EquiSaaS BD, the engineering task force behind BinaryWebEngine, specialized in security operations, UI/UX, and cloud architecture.";
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        "name": "About Team EquiSaaS BD",
        "description": "Meet the engineering task force behind BinaryWebEngine, specialized in security operations, UI/UX, and cloud architecture."
      };
    } else if (route === '/contact') {
      title = "Contact | BinaryWebEngine";
      description = "Get in touch with our live security analysts and support engineers at BinaryShielders.";
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        "name": "Contact BinaryShielders Support",
        "description": "Get in touch with our live security analysts and support engineers."
      };
    }

    // Replace fallback default tags in template with optimized values
    html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
    html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${description}" />`);
    
    // Inject Canonical URL
    const canonicalTag = `<link rel="canonical" href="https://binarywebengine.equisaas-bd.com${route}" />`;
    
    // Inject Structured Data (JSON-LD)
    const structuredDataScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
    
    html = html.replace('</head>', `${canonicalTag}\n${structuredDataScript}\n</head>`);

    fs.writeFileSync(filepath, html, 'utf8');
    console.log(`[SEO Prerender] Generated static build for route: ${route} -> ${filename}`);
  }
}

prerender().catch(console.error);
