import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { enhancePicker } from './core/bhashini';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    // The language picker lives in <body>, outside this component's view, so
    // it is set up once here rather than by whichever screen is showing.
    enhancePicker();
  }
}
