import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';

const ROLE_CARDS = [
  {
    title: 'See the customer side',
    description: 'Write a support message, send a sample case, and watch the case status update as the workflow progresses.',
    href: '/portal',
    cta: 'Open customer portal',
  },
  {
    title: 'See the support admin side',
    description: 'Review the queue, inspect case reasoning, and approve or reject refund recommendations.',
    href: '/admin',
    cta: 'Open admin queue',
  },
];

export function Landing() {
  return (
    <div className="mx-auto max-w-4xl">
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Do you want to use the demo as a customer or as support?
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            The customer side lets you submit a support request. The admin side lets you review cases and approve or reject refund recommendations.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {ROLE_CARDS.map(role => (
            <Card key={role.href}>
              <CardHeader>
                <CardTitle>{role.title}</CardTitle>
                <CardDescription>{role.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button render={<Link to={role.href} />}>
                  {role.cta}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
