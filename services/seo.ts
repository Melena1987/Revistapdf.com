
export const updateMetaTags = (title: string, description: string, imageUrl: string) => {
  const fullTitle = `${title} | REVISTAPDF.COM`;
  document.title = fullTitle;

  const metaTags: Record<string, string> = {
    'description': description,
    'og:title': fullTitle,
    'og:description': description,
    'og:image': imageUrl,
    'twitter:title': fullTitle,
    'twitter:description': description,
    'twitter:image': imageUrl,
  };

  Object.entries(metaTags).forEach(([name, value]) => {
    // Try by property (Common for Open Graph)
    let element = document.querySelector(`meta[property="${name}"]`);
    if (!element) {
      // Try by name (Standard for SEO and Twitter)
      element = document.querySelector(`meta[name="${name}"]`);
    }

    if (element) {
      element.setAttribute('content', value);
    } else {
      // Create if it doesn't exist to ensure sharing works
      const newMeta = document.createElement('meta');
      if (name.startsWith('og:')) {
        newMeta.setAttribute('property', name);
      } else {
        newMeta.setAttribute('name', name);
      }
      newMeta.setAttribute('content', value);
      document.head.appendChild(newMeta);
    }
  });
};

export const resetMetaTags = () => {
  updateMetaTags(
    'REVISTAPDF.COM - Convierte tu PDF en Revista Digital',
    'Plataforma para convertir documentos PDF en Flipbook o formato revista online con efecto al pasar página y análisis de IA.',
    'https://revistapdf.com/og-image.jpg'
  );
};
