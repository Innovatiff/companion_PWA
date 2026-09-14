/** Not found, with no framework JS (Next's default error page ships its runtime). */
import Head from "next/head";
import { AuthLayout } from "@leamington/shared/src/ui/Portal.tsx";

export const config = { unstable_runtimeJS: false };

export default function NotFound() {
  return (
    <>
      <Head>
        <title>No encontrado · Hoy Admin</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <AuthLayout brand="Hoy" product="Admin">
        <h1>No encontrado<small>Not found</small></h1>
        <p><a href="/">Ventas · Sales</a></p>
      </AuthLayout>
    </>
  );
}
