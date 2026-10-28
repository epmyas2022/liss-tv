import {
  DetailNavbarSkeleton,
  HeroBackdropSkeleton,
} from "@/components/detail/DetailSkeleton";

export default function MovieDetailLoading() {
  return (
    <main className="min-h-screen bg-[#090a0c] text-white pb-20">
      <DetailNavbarSkeleton />
      <HeroBackdropSkeleton isSerie={false} />
    </main>
  );
}
