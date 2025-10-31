export default function handler(_req,res){
  res.status(200).json({
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    url: process.env.VERCEL_URL || null
  });
}
