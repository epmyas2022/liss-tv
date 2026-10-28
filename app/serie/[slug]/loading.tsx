import {
  DetailNavbarSkeleton,
  HeroBackdropSkeleton,
  EpisodeListSkeleton,
} from "@/components/detail/DetailSkeleton";

export default function SerieDetailLoading() {
  return (
    <main className="min-h-screen bg-[#090a0c] text-white pb-20">
      <DetailNavbarSkeleton />
      <HeroBackdropSkeleton isSerie={true} />
      <EpisodeListSkeleton />
    </main>
  );
}
