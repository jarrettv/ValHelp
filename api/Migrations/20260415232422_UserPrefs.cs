using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ValHelpApi.Migrations
{
    /// <inheritdoc />
    public partial class UserPrefs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "prefs",
                table: "users",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "prefs",
                table: "users");
        }
    }
}
