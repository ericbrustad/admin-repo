// game/pages/[slug].jsx
export async function getServerSideProps({ params, query }) {
  const { slug } = params || {};
  const channel = query.channel || 'published';
  const preview = query.preview ? `&preview=${encodeURIComponent(query.preview)}` : '';
  return {
    redirect: {
      destination: `/?slug=${encodeURIComponent(slug)}&channel=${encodeURIComponent(channel)}${preview}`,
      permanent: false,
    },
  };
}
export default function SlugRedirect() { return null; }
