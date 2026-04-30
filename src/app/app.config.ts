import {
  ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { LucideAngularModule } from 'lucide-angular';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Facebook,
  Filter,
  Home,
  Instagram,
  Leaf,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Thermometer,
  Trash2,
  TrendingUp,
  Truck,
  Twitter,
  User,
  X,
} from 'lucide-angular/src/icons';
import { NgxSpinnerModule } from 'ngx-spinner';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { loadingInterceptor } from './core/loading.interceptor';

const lucideIcons = LucideAngularModule.pick({
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Facebook,
  Filter,
  Home,
  Instagram,
  Leaf,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Thermometer,
  Trash2,
  TrendingUp,
  Truck,
  Twitter,
  User,
  X,
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(
      withInterceptors([authInterceptor, loadingInterceptor]),
    ),
    importProvidersFrom(
      NgxSpinnerModule.forRoot({ type: 'ball-spin-clockwise' }),
    ),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimations(),
    importProvidersFrom(lucideIcons),
  ],
};
