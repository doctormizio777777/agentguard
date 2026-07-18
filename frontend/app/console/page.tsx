import MissionControl from "../mission-control";


type ConsolePageProps = {
  searchParams: Promise<{ demo?: string }>;
};


export default async function ConsolePage({ searchParams }: ConsolePageProps) {
  const { demo } = await searchParams;
  return <MissionControl initialDemoOpen={demo === "1"} />;
}
