import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
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

export const SOURCE_URL = 'https://github.com/Nebojsa1005/clavis';

@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
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
      title: 'Export za svaku namenu',
      text: 'MusicXML za druge notne programe, MIDI za DAW, a PNG, SVG i PDF za štampu i deljenje.',
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
      text: 'Sačuvaj u biblioteku browsera, ili izvezi u MusicXML, MIDI, PDF, PNG ili SVG.',
    },
  ];
}
