import { Component } from '@angular/core';

@Component({
  selector: 'app-location',
  standalone: true,
  templateUrl: './location.component.html',
})
export class LocationComponent {
  readonly locations = [
    {
      city: 'Subang Jaya, Selangor',
      label: 'SUBANG JAYA',
      address:
        'Lot G-12, Ground Floor, Empire Shopping Gallery, Jalan SS16/1, 47500 Subang Jaya, Selangor',
      phone: '+60 3-5611 1234',
      hours: 'Mon - Sun: 10:00 AM - 10:00 PM',
      image:
        'https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&q=80&w=1000',
    },
    {
      city: 'Batu Pahat, Johor',
      label: 'BATU PAHAT',
      address:
        'No. 15, Jalan Flora Utama 4, Taman Flora Utama, 83000 Batu Pahat, Johor',
      phone: '+60 7-431 5678',
      hours: 'Mon - Sun: 10:00 AM - 9:00 PM',
      image:
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1000',
    },
  ];

  openMaps(address: string): void {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
      '_blank',
    );
  }
}
