import { cityRegions } from "@/data/cities";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function CityDirectory() {
  return (
    <section className="bg-surface-muted/40">
      <div className="mx-auto flex max-w-content flex-col gap-10 px-6 py-16 lg:py-24">
        <SectionHeading
          align="left"
          eyebrow="Dove siamo"
          title="Pet sitting nella tua città"
          subtitle="La lista delle città coperte oggi, e di quelle in arrivo."
        />

        <div className="grid gap-10 sm:grid-cols-2">
          {cityRegions.map((region) => (
            <div key={region.region} className="flex flex-col gap-3">
              <h3 className="font-display font-bold text-ink">{region.region}</h3>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {region.cities.map((city) => (
                  <li key={city}>
                    <a href="#hero-search" className="text-sm text-ink-muted hover:text-accent">
                      Pet sitting {city}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
