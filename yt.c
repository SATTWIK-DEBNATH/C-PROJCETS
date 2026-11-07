#include<stdio.h>
#include<math.h>
float input();
float findDiscriminant(float a, float b, float c);
void findRoots(float a, float b, float discriminant);

float input(){
    float value;
    scanf("%f",&value);
    return value;
}

float findDiscriminant(float a, float b, float c){
    return (b*b)-(4*a*c);
}

void findRoots(float a, float b, float discriminant){
    float root1 , root2;
    if(discriminant>0){
        printf("The Equation has two distinct real roots.\n");
        root1 = (-b + sqrt(discriminant)) / (2*a);
        root2 = (-b - sqrt(discriminant)) / (2*a);
        printf("Root1 = %.2f\n",root1);
        printf("Root2 = %.2f\n",root2);

    }
    else if(discriminant < 0){
        printf("The Equation has two equal real roots.\n");
        root1 = root2 = -b / (2*a);
        printf("The Root1 = %.2f",root1);
        printf("The Root2 = %.2f",root2);

    }
    else{
        printf("The Equation has no real roots.\n");
    }
}

int main(){
    float a , b , c , discriminant;
    printf("Enter the coefficient a : ");
    a = input();
    printf("Enter the coefficient b : ");
    b = input();
    printf("Enter the coefficent c : ");
    c = input();
    discriminant = findDiscriminant(a , b , c);
    findRoots(a , b , discriminant);
    return 0;

}
