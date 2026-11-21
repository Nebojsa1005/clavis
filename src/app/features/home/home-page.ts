import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmAccordionImports } from '@spartan-ng/helm/accordion';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { Logo } from '../../shared/logo';
import { HeroStaff } from './hero-staff/hero-staff';
import { Reveal } from './motion';

type FeatureIcon = 'note' | 'caret' | 'undo' | 'play' | 'export' | 'library';

interface Feature {
  icon: FeatureIcon;
  title: string;
  text: string;
  keys: string[];
}

interface Step {
  title: string;
  text: string;
}

interface Faq {
  question: string;
  answer: string;
}

export const SOURCE_URL = 'https://github.com/Nebojsa1005/clavis';
const SITE_URL = 'https://clavis-editor.vercel.app/';

export const FAQ: Faq[] = [
  {
    question: 'Šta je Clavis Editor?',
    answer:
      'Clavis Editor je notni editor koji radi u browseru. U njemu upisuješ note mišem ili tastaturom, preslušavaš partituru i izvoziš je kao PDF.',
  },
  {
    question: 'Da li je Clavis Editor besplatan?',
    answer: 'Da. Clavis Editor je besplatan i nema plaćenih funkcija. Izvorni kod je javan na GitHubu.',
  },
  {
    question: 'Koje formate Clavis Editor izvozi?',
    answer: 'Partitura se izvozi kao PDF u A4 formatu, spremna za štampu i deljenje.',
  },
  {
    question: 'Da li treba instalacija ili nalog?',
    answer:
      'Ne. Editor se otvara direktno u browseru, bez instalacije i prijave. Partiture se čuvaju u browseru na tvom uređaju, ne na serveru.',
  },
  {
    question: 'Da li Clavis Editor radi na telefonu?',
    answer:
      'Stranica se otvara i na telefonu, ali editor je pravljen za računar: note se upisuju mišem i tastaturom, a prečice traže tastaturu.',
  },
];

/** schema.org graph for crawlers; the FAQ answers are the same text the page shows. */
export function structuredData(description: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'Clavis Editor', url: SITE_URL, inLanguage: 'sr' },
      {
        '@type': 'WebApplication',
        name: 'Clavis Editor',
        url: SITE_URL,
        description,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        inLanguage: 'sr',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        featureList: [
          'Unos nota mišem i tastaturom',
          'Kursor i kretanje kroz taktove strelicama',
          'Poništavanje i ponavljanje izmena',
          'Plejbek sa tempom od 20 do 300 BPM i metronomom',
          'Izvoz partiture u PDF (A4)',
          'Čuvanje partitura u lokalnoj biblioteci browsera',
        ],
        codeRepository: SOURCE_URL,
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
    ],
  };
}

@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    HlmAccordionImports,
    HeroStaff,
    Logo,
    Reveal,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSeparatorImports,
  ],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly sourceUrl = SOURCE_URL;
  protected readonly year = new Date().getFullYear();
  protected readonly faq = FAQ;

  protected readonly features: Feature[] = [
    {
      icon: 'note',
      title: 'Unos mišem i tastaturom',
      text: 'Klikni na liniju gde nota treba da stoji, ili uključi mod unosa i biraj trajanje brojevima.',
      keys: ['N', '1–7'],
    },
    {
      icon: 'caret',
      title: 'Kursor kroz partituru',
      text: 'Kursor pokazuje gde ide sledeća nota. Strelicama se krećeš kroz taktove i dopisuješ bilo gde.',
      keys: ['←', '→'],
    },
    {
      icon: 'undo',
      title: 'Vrati i ponovi',
      text: 'Svaka izmena se može poništiti, pa slobodno probaj. Ponavljanje vraća ono što si poništio.',
      keys: ['Ctrl Z', 'Ctrl ⇧ Z'],
    },
    {
      icon: 'play',
      title: 'Plejbek sa tempom',
      text: 'Preslušaj partituru u browseru, podesi tempo od 20 do 300 BPM i uključi metronom.',
      keys: [],
    },
    {
      icon: 'export',
      title: 'Export u PDF',
      text: 'Partitura se izvozi kao PDF u A4 formatu, spremna za štampu i deljenje.',
      keys: [],
    },
    {
      icon: 'library',
      title: 'Čuvanje u browseru',
      text: 'Partiture ostaju u lokalnoj biblioteci sa nazivom i datumom. Bez naloga i bez servera.',
      keys: ['Ctrl S'],
    },
  ];

  protected readonly steps: Step[] = [
    {
      title: 'Otvori editor',
      text: 'Nema instalacije ni prijave. Poslednja sačuvana partitura otvara se sama, a editor te upozori ako ima nesačuvanih izmena.',
    },
    {
      title: 'Upiši note',
      text: 'Pritisni N, klikni na štap na visini note i upiši je. Brojevi biraju trajanje, strelice pomeraju kursor.',
    },
    {
      title: 'Preslušaj',
      text: 'Pusti partituru, uspori je ili ubrzaj i uključi metronom da proveriš ritam.',
    },
    {
      title: 'Sačuvaj ili izvezi',
      text: 'Sačuvaj u biblioteku browsera, ili izvezi partituru kao PDF.',
    },
  ];

  constructor() {
    const doc = inject(DOCUMENT);
    // Written into <head> at prerender; after hydration the prerendered script is already there.
    if (doc.getElementById('structured-data')) return;
    const script = doc.createElement('script');
    script.id = 'structured-data';
    script.type = 'application/ld+json';
    const description = doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
    script.textContent = JSON.stringify(structuredData(description));
    doc.head.appendChild(script);
  }
}
