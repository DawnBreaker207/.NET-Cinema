import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import CustomerLayout from '@/layouts/CustomerLayout';
import { PATHS, accountTicketsPath } from './paths';
import StaffRedirect from './StaffRedirect';

const CustomerLoginPage = lazy(() => import('@/features/auth/CustomerLoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const HomePage = lazy(() => import('@/features/browse/HomePage'));
const FilmPage = lazy(() => import('@/features/browse/FilmPage'));
const FilmsPage = lazy(() => import('@/features/browse/FilmsPage'));
const PricingPage = lazy(() => import('@/features/browse/PricingPage'));
const CinemaInfoPage = lazy(() => import('@/features/browse/CinemaInfoPage'));
const OffersPage = lazy(() => import('@/features/browse/OffersPage'));
const OfferDetailPage = lazy(() => import('@/features/browse/OfferDetailPage'));
const AccountPage = lazy(() => import('@/features/account/AccountPage'));
const BookingFlowPage = lazy(() => import('@/features/booking-flow/BookingFlowPage'));
const BookingSuccessPage = lazy(() => import('@/features/booking-flow/BookingSuccessPage'));
const PaymentResultPage = lazy(() => import('@/features/booking-flow/PaymentResultPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export const router = createBrowserRouter([
  {
    element: <CustomerLayout />,
    children: [
      {
        path: PATHS.home,
        element: <HomePage />,
        handle: { fullBleed: true, overlayHeader: true },
      },
      { path: PATHS.film, element: <FilmPage /> },
      { path: PATHS.films, element: <FilmsPage /> },
      { path: PATHS.pricing, element: <PricingPage /> },
      { path: PATHS.cinemaInfo, element: <CinemaInfoPage /> },
      { path: PATHS.offers, element: <OffersPage /> },
      { path: PATHS.offerDetail, element: <OfferDetailPage /> },
      { path: PATHS.account, element: <AccountPage /> },
      { path: PATHS.selectSeat, element: <BookingFlowPage /> },
      { path: PATHS.bookingSuccess, element: <BookingSuccessPage /> },
      { path: PATHS.paymentResult, element: <PaymentResultPage /> },
      { path: '/my-tickets', element: <Navigate to={accountTicketsPath()} replace /> },
      {
        path: PATHS.customerLogin,
        element: <CustomerLoginPage />,
        handle: { fullBleed: true },
      },
      { path: PATHS.register, element: <RegisterPage />, handle: { fullBleed: true } },
      {
        path: PATHS.forgotPassword,
        element: <ForgotPasswordPage />,
        handle: { fullBleed: true },
      },
      {
        path: PATHS.resetPassword,
        element: <ResetPasswordPage />,
        handle: { fullBleed: true },
      },
    ],
  },
  // Operator console (dashboard/counter/profile/admin) is Razor-only now (/admin).
  { path: PATHS.login, element: <StaffRedirect /> },
  { path: PATHS.dashboard, element: <StaffRedirect /> },
  { path: PATHS.profile, element: <StaffRedirect /> },
  { path: PATHS.counter, element: <StaffRedirect /> },
  { path: PATHS.catalog, element: <StaffRedirect /> },
  { path: PATHS.bookings, element: <StaffRedirect /> },
  { path: PATHS.users, element: <StaffRedirect /> },
  { path: PATHS.promotions, element: <StaffRedirect /> },
  { path: PATHS.pricingAdmin, element: <StaffRedirect /> },
  { path: PATHS.monitoring, element: <StaffRedirect /> },
  { path: PATHS.notFound, element: <NotFoundPage /> },
]);
